/*
 * Copyright 2021 Spotify AB
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

import React from 'react';
import { useAsync } from 'react-use';
import { Alert } from '@material-ui/lab';
import { useApi, ContentHeader } from '@backstage/core';
import { Box } from '@material-ui/core';

import {
  ComponentConfig,
  ComponentConfigCreateRc,
  ComponentConfigPatch,
  ComponentConfigPromoteRc,
} from './types/types';
import { CenteredCircularProgress } from './components/CenteredCircularProgress';
import { Features } from './features/Features';
import { gitReleaseManagerApiRef } from './api/serviceApiRef';
import { InfoCardPlus } from './components/InfoCardPlus';
import { isProjectValid } from './helpers/isProjectValid';
import { ProjectContext, Project } from './contexts/ProjectContext';
import { RepoDetailsForm } from './features/RepoDetailsForm/RepoDetailsForm';
import { useQueryHandler } from './hooks/useQueryHandler';
import { UserContext } from './contexts/UserContext';

interface GitReleaseManagerProps {
  project?: Omit<Project, 'isProvidedViaProps'>;
  features?: {
    info?: Pick<ComponentConfig<void>, 'omit'>;
    stats?: Pick<ComponentConfig<void>, 'omit'>;
    createRc?: ComponentConfigCreateRc;
    promoteRc?: ComponentConfigPromoteRc;
    patch?: ComponentConfigPatch;
  };
}

export function GitReleaseManager(props: GitReleaseManagerProps) {
  const pluginApiClient = useApi(gitReleaseManagerApiRef);

  const { getParsedQuery } = useQueryHandler();
  const { parsedQuery } = getParsedQuery();
  const project: Project = isProjectValid(props.project)
    ? {
        ...props.project,
        isProvidedViaProps: true,
      }
    : {
        owner: parsedQuery.owner ?? '',
        repo: parsedQuery.repo ?? '',
        versioningStrategy: parsedQuery.versioningStrategy ?? 'semver',
        isProvidedViaProps: false,
      };

  const usernameResponse = useAsync(() =>
    pluginApiClient.getUser({ owner: project.owner, repo: project.repo }),
  );

  if (usernameResponse.error) {
    return <Alert severity="error">{usernameResponse.error.message}</Alert>;
  }

  if (usernameResponse.loading) {
    return <CenteredCircularProgress />;
  }

  if (!usernameResponse.value?.username) {
    return <Alert severity="error">Unable to retrieve username</Alert>;
  }

  const user = {
    username: usernameResponse.value.username,
    email: usernameResponse.value.email,
  };

  return (
    <ProjectContext.Provider value={{ project }}>
      <UserContext.Provider value={{ user }}>
        <Box maxWidth={999}>
          <ContentHeader title="Git Release Manager" />

          <InfoCardPlus>
            <RepoDetailsForm username={usernameResponse.value.username} />
          </InfoCardPlus>

          {isProjectValid(project) && <Features features={props.features} />}
        </Box>
      </UserContext.Provider>
    </ProjectContext.Provider>
  );
}
