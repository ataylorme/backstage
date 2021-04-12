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
import { getRcGheInfo } from '../getRcGheInfo';
import {
  ComponentConfigCreateRc,
  GhCreateReferenceResponse,
  GhGetReleaseResponse,
  GhGetRepositoryResponse,
  ResponseStep,
} from '../../../types/types';
import { RMaaSApiClient } from '../../../api/RMaaSApiClient';
import { ReleaseManagerAsAServiceError } from '../../../errors/ReleaseManagerAsAServiceError';

interface CreateGheRC {
  apiClient: RMaaSApiClient;
  defaultBranch: GhGetRepositoryResponse['default_branch'];
  latestRelease: GhGetReleaseResponse | null;
  nextGheInfo: ReturnType<typeof getRcGheInfo>;
  successCb?: ComponentConfigCreateRc['successCb'];
}

export async function createGheRc({
  apiClient,
  defaultBranch,
  latestRelease,
  nextGheInfo,
  successCb,
}: CreateGheRC) {
  const responseSteps: ResponseStep[] = [];

  /**
   * 1. Get the default branch's most recent commit
   */
  const { latestCommit } = await apiClient.getLatestCommit({
    defaultBranch,
  });
  responseSteps.push({
    message: `Fetched latest commit from "${defaultBranch}"`,
    secondaryMessage: `with message "${latestCommit.commit.message}"`,
    link: latestCommit.html_url,
  });

  /**
   * 2. Create a new ref based on the default branch's most recent sha
   */
  const mostRecentSha = latestCommit.sha;
  let createdRef: GhCreateReferenceResponse;
  try {
    createdRef = (
      await apiClient.createRc.createRef({
        mostRecentSha,
        targetBranch: nextGheInfo.rcBranch,
      })
    ).createdRef;
  } catch (error) {
    if (error.body.message === 'Reference already exists') {
      throw new ReleaseManagerAsAServiceError(
        `Branch "${nextGheInfo.rcBranch}" already exists: .../tree/${nextGheInfo.rcBranch}`,
      );
    }
    throw error;
  }
  responseSteps.push({
    message: 'Cut Release Branch',
    secondaryMessage: `with ref "${createdRef.ref}"`,
  });

  /**
   * 3. Compose a body for the release
   */
  const previousReleaseBranch = latestRelease
    ? latestRelease.target_commitish
    : defaultBranch;
  const nextReleaseBranch = nextGheInfo.rcBranch;
  const { comparison } = await apiClient.createRc.getComparison({
    previousReleaseBranch,
    nextReleaseBranch,
  });
  const releaseBody = `**Compare** ${comparison.html_url}

**Ahead by** ${comparison.ahead_by} commits

**Release branch** ${createdRef.ref}

---

`;
  responseSteps.push({
    message: 'Fetched commit comparision',
    secondaryMessage: `${previousReleaseBranch}...${nextReleaseBranch}`,
    link: comparison.html_url,
  });

  /**
   * 4. Creates the release itself in GHE
   */
  const { createReleaseResponse } = await apiClient.createRc.createRelease({
    nextGheInfo,
    releaseBody,
  });
  responseSteps.push({
    message: `Created Release Candidate "${createReleaseResponse.name}"`,
    secondaryMessage: `with tag "${nextGheInfo.rcReleaseTag}"`,
    link: createReleaseResponse.html_url,
  });

  await successCb?.({
    gitHubReleaseUrl: createReleaseResponse.html_url,
    gitHubReleaseName: createReleaseResponse.name,
    comparisonUrl: comparison.html_url,
    previousTag: latestRelease?.tag_name,
    createdTag: createReleaseResponse.tag_name,
  });

  return responseSteps;
}
