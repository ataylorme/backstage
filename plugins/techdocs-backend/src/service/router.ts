/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  PluginEndpointDiscovery,
  PluginCacheManager,
} from '@backstage/backend-common';
import { CatalogClient } from '@backstage/catalog-client';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Config } from '@backstage/config';
import { NotFoundError, NotModifiedError } from '@backstage/errors';
import {
  GeneratorBuilder,
  getLocationForEntity,
  PreparerBuilder,
  PublisherBase,
} from '@backstage/techdocs-common';
import express, { Response } from 'express';
import Router from 'express-promise-router';
import { Knex } from 'knex';
import { Logger } from 'winston';
import { ScmIntegrations } from '@backstage/integration';
import { DocsSynchronizer, DocsSynchronizerSyncOpts } from './DocsSynchronizer';
import { createCacheMiddleware, TechDocsCache } from '../cache';
import { CachedEntityLoader } from './CachedEntityLoader';
import {
  DefaultDocsBuildStrategy,
  DocsBuildStrategy,
} from './DocsBuildStrategy';

/**
 * Required dependencies for running TechDocs in the "out-of-the-box"
 * deployment configuration (prepare/generate/publish all in the Backend).
 *
 * @public
 */
export type OutOfTheBoxDeploymentOptions = {
  preparers: PreparerBuilder;
  generators: GeneratorBuilder;
  publisher: PublisherBase;
  logger: Logger;
  discovery: PluginEndpointDiscovery;
  database?: Knex; // TODO: Make database required when we're implementing database stuff.
  config: Config;
  cache: PluginCacheManager;
  docsBuildStrategy?: DocsBuildStrategy;
};

/**
 * Required dependencies for running TechDocs in the "recommended" deployment
 * configuration (prepare/generate handled externally in CI/CD).
 *
 * @public
 */
export type RecommendedDeploymentOptions = {
  publisher: PublisherBase;
  logger: Logger;
  discovery: PluginEndpointDiscovery;
  config: Config;
  cache: PluginCacheManager;
  docsBuildStrategy?: DocsBuildStrategy;
};

/**
 * One of the two deployment configurations must be provided.
 *
 * @public
 */
export type RouterOptions =
  | RecommendedDeploymentOptions
  | OutOfTheBoxDeploymentOptions;

/**
 * Typeguard to help createRouter() understand when we are in a "recommended"
 * deployment vs. when we are in an out-of-the-box deployment configuration.
 *
 * * @public
 */
function isOutOfTheBoxOption(
  opt: RouterOptions,
): opt is OutOfTheBoxDeploymentOptions {
  return (opt as OutOfTheBoxDeploymentOptions).preparers !== undefined;
}

/**
 * Creates a techdocs router.
 *
 * @public
 */
export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const router = Router();
  const { publisher, config, logger, discovery } = options;
  const catalogClient = new CatalogClient({ discoveryApi: discovery });
  const docsBuildStrategy =
    options.docsBuildStrategy ?? DefaultDocsBuildStrategy.fromConfig(config);

  // Entities are cached to optimize the /static/docs request path, which can be called many times
  // when loading a single techdocs page.
  const entityLoader = new CachedEntityLoader({
    catalog: catalogClient,
    cache: options.cache.getClient(),
  });

  // Set up a cache client if configured.
  let cache: TechDocsCache | undefined;
  const defaultTtl = config.getOptionalNumber('techdocs.cache.ttl');
  if (defaultTtl) {
    const cacheClient = options.cache.getClient({ defaultTtl });
    cache = TechDocsCache.fromConfig(config, { cache: cacheClient, logger });
  }

  const scmIntegrations = ScmIntegrations.fromConfig(config);
  const docsSynchronizer = new DocsSynchronizer({
    publisher,
    logger,
    config,
    scmIntegrations,
    cache,
  });

  router.get('/metadata/techdocs/:namespace/:kind/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    const entityName = { kind, namespace, name };
    const token = getBearerToken(req.headers.authorization);

    // Verify that the related entity exists and the current user has permission to view it.
    const entity = await entityLoader.load(entityName, token);

    if (!entity) {
      throw new NotFoundError(
        `Unable to get metadata for '${stringifyEntityRef(entityName)}'`,
      );
    }

    try {
      const techdocsMetadata = await publisher.fetchTechDocsMetadata(
        entityName,
      );

      res.json(techdocsMetadata);
    } catch (err) {
      logger.info(
        `Unable to get metadata for '${stringifyEntityRef(
          entityName,
        )}' with error ${err}`,
      );
      throw new NotFoundError(
        `Unable to get metadata for '${stringifyEntityRef(entityName)}'`,
        err,
      );
    }
  });

  router.get('/metadata/entity/:namespace/:kind/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    const entityName = { kind, namespace, name };
    const token = getBearerToken(req.headers.authorization);

    const entity = await entityLoader.load(entityName, token);

    if (!entity) {
      throw new NotFoundError(
        `Unable to get metadata for '${stringifyEntityRef(entityName)}'`,
      );
    }

    try {
      const locationMetadata = getLocationForEntity(entity, scmIntegrations);
      res.json({ ...entity, locationMetadata });
    } catch (err) {
      logger.info(
        `Unable to get metadata for '${stringifyEntityRef(
          entityName,
        )}' with error ${err}`,
      );
      throw new NotFoundError(
        `Unable to get metadata for '${stringifyEntityRef(entityName)}'`,
        err,
      );
    }
  });

  // Check if docs are the latest version and trigger rebuilds if not
  // Responds with an event-stream that closes after the build finished
  // Responds with an immediate success if rebuild not needed
  // If a build is required, responds with a success when finished
  router.get('/sync/:namespace/:kind/:name', async (req, res) => {
    const { kind, namespace, name } = req.params;
    const token = getBearerToken(req.headers.authorization);

    const entity = await entityLoader.load({ kind, namespace, name }, token);

    if (!entity?.metadata?.uid) {
      throw new NotFoundError('Entity metadata UID missing');
    }

    let responseHandler: DocsSynchronizerSyncOpts;
    if (req.header('accept') !== 'text/event-stream') {
      console.warn(
        "The call to /sync/:namespace/:kind/:name wasn't done by an EventSource. This behavior is deprecated and will be removed soon. Make sure to update the @backstage/plugin-techdocs package in the frontend to the latest version.",
      );
      responseHandler = createHttpResponse(res);
    } else {
      responseHandler = createEventStream(res);
    }

    // By default, techdocs-backend will only try to build documentation for an entity if techdocs.builder is set to
    // 'local'. If set to 'external', it will assume that an external process (e.g. CI/CD pipeline
    // of the repository) is responsible for building and publishing documentation to the storage provider.
    // Altering the implementation of the injected docsBuildStrategy allows for more complex behaviours, based on
    // either config or the properties of the entity (e.g. annotations, labels, spec fields etc.).
    const shouldBuild = await docsBuildStrategy.shouldBuild({ entity });
    if (!shouldBuild) {
      // However, if caching is enabled, take the opportunity to check and
      // invalidate stale cache entries.
      if (cache) {
        await docsSynchronizer.doCacheSync({
          responseHandler,
          discovery,
          token,
          entity,
        });
        return;
      }
      responseHandler.finish({ updated: false });
      return;
    }

    // Set the synchronization and build process if "out-of-the-box" configuration is provided.
    if (isOutOfTheBoxOption(options)) {
      const { preparers, generators } = options;

      await docsSynchronizer.doSync({
        responseHandler,
        entity,
        preparers,
        generators,
      });
      return;
    }

    responseHandler.error(
      new Error(
        "Invalid configuration. 'docsBuildStrategy.shouldBuild returned 'true', but no 'preparer' was provided to the router initialization.",
      ),
    );
  });

  // Ensures that the related entity exists and the current user has permission to view it.
  if (config.getOptionalBoolean('permission.enabled')) {
    router.use(
      '/static/docs/:namespace/:kind/:name',
      async (req, _res, next) => {
        const { kind, namespace, name } = req.params;
        const entityName = { kind, namespace, name };
        const token = getBearerToken(req.headers.authorization);

        const entity = await entityLoader.load(entityName, token);

        if (!entity) {
          throw new NotFoundError(
            `Entity not found for ${stringifyEntityRef(entityName)}`,
          );
        }

        next();
      },
    );
  }

  // If a cache manager was provided, attach the cache middleware.
  if (cache) {
    router.use(createCacheMiddleware({ logger, cache }));
  }

  // Route middleware which serves files from the storage set in the publisher.
  router.use('/static/docs', publisher.docsRouter());

  return router;
}

function getBearerToken(header?: string): string | undefined {
  return header?.match(/(?:Bearer)\s+(\S+)/i)?.[1];
}

/**
 * Create an event-stream response that emits the events 'log', 'error', and 'finish'.
 *
 * @param res - the response to write the event-stream to
 * @returns A tuple of <log, error, finish> callbacks to emit messages. A call to 'error' or 'finish'
 *          will close the event-stream.
 */
export function createEventStream(
  res: Response<any, any>,
): DocsSynchronizerSyncOpts {
  // Mandatory headers and http status to keep connection open
  res.writeHead(200, {
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
  });

  // client closes connection
  res.socket?.on('close', () => {
    res.end();
  });

  // write the event to the stream
  const send = (type: 'error' | 'finish' | 'log', data: any) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

    // res.flush() is only available with the compression middleware
    if (res.flush) {
      res.flush();
    }
  };

  return {
    log: data => {
      send('log', data);
    },

    error: e => {
      send('error', e.message);
      res.end();
    },

    finish: result => {
      send('finish', result);
      res.end();
    },
  };
}

/**
 *  @deprecated use event-stream implementation of the sync endpoint
 * */
export function createHttpResponse(
  res: Response<any, any>,
): DocsSynchronizerSyncOpts {
  return {
    log: () => {},
    error: e => {
      throw e;
    },
    finish: ({ updated }) => {
      if (!updated) {
        throw new NotModifiedError();
      }

      res
        .status(201)
        .json({ message: 'Docs updated or did not need updating' });
    },
  };
}
