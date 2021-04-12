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
import { createDevApp } from '@backstage/dev-utils';
import {
  releaseManagerAsAServicePlugin,
  ReleaseManagerAsAServicePage,
} from '../src/plugin';

createDevApp()
  .registerPlugin(releaseManagerAsAServicePlugin)
  .addPage({
    element: (
      <ReleaseManagerAsAServicePage
        project={{
          github: {
            org: 'erikengervall',
            repo: 'playground',
          },
          name: 'ReleaseManagerAsAService (semver)',
          versioningStrategy: 'semver',
        }}
      />
    ),
    title: 'Root Page',
  })
  .addPage({
    element: (
      <ReleaseManagerAsAServicePage
        project={{
          github: {
            org: 'erikengervall',
            repo: 'playground-2',
          },
          name: 'ReleaseManagerAsAService (calver)',
          versioningStrategy: 'calver',
        }}
      />
    ),
    title: 'Another page',
  })
  .render();
