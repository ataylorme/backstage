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
import { format } from 'date-fns';

import { getBumpedSemverTagParts } from '../../helpers/getBumpedTag';
import { getSemverTagParts } from '../../helpers/tagParts/getSemverTagParts';
import { Project, GhGetReleaseResponse } from '../../types/types';
import { SEMVER_PARTS } from '../../constants/constants';

export const getRcGheInfo = ({
  project,
  latestRelease,
  semverBumpLevel,
  injectedDate = format(new Date(), 'yyyy.MM.dd'), // '0012-01-01T13:37:00.000Z'
}: {
  project: Project;
  latestRelease: GhGetReleaseResponse | null;
  semverBumpLevel: keyof typeof SEMVER_PARTS;
  injectedDate?: string;
}) => {
  if (project.versioningStrategy === 'calver') {
    return {
      rcBranch: `rc/${injectedDate}`,
      rcReleaseTag: `rc-${injectedDate}_0`,
      releaseName: `Version ${injectedDate}`,
    };
  }

  if (!latestRelease) {
    return {
      rcBranch: 'rc/0.0.1',
      rcReleaseTag: 'rc-0.0.1',
      releaseName: 'Version 0.0.1',
    };
  }

  const tagParts = getSemverTagParts(latestRelease.tag_name);
  const { bumpedTagParts } = getBumpedSemverTagParts(tagParts, semverBumpLevel);

  const bumpedTag = `${bumpedTagParts.major}.${bumpedTagParts.minor}.${bumpedTagParts.patch}`;

  return {
    rcBranch: `rc/${bumpedTag}`,
    rcReleaseTag: `rc-${bumpedTag}`,
    releaseName: `Version ${bumpedTag}`,
  };
};
