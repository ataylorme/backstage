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
import { render } from '@testing-library/react';

import {
  mockRcRelease,
  mockReleaseVersion,
} from '../../test-helpers/test-helpers';
import { TEST_IDS } from '../../test-helpers/test-ids';

jest.mock('./PromoteRcBody', () => ({
  PromoteRcBody: () => (
    <div data-testid={TEST_IDS.promoteRc.mockedPromoteRcBody}>Hello</div>
  ),
}));

import { PromoteRc } from './PromoteRc';

describe('PromoteRc', () => {
  it('return early if no latest release present', () => {
    const { getByTestId } = render(
      <PromoteRc latestRelease={null} setRefetch={jest.fn()} />,
    );

    expect(
      getByTestId(TEST_IDS.components.noLatestRelease),
    ).toBeInTheDocument();
  });

  it('should display not-rc warning', () => {
    const { getByTestId } = render(
      <PromoteRc latestRelease={mockReleaseVersion} setRefetch={jest.fn()} />,
    );

    expect(getByTestId(TEST_IDS.promoteRc.notRcWarning)).toBeInTheDocument();
  });

  it('should display PromoteRcBody', () => {
    const { getByTestId } = render(
      <PromoteRc latestRelease={mockRcRelease} setRefetch={jest.fn()} />,
    );

    expect(
      getByTestId(TEST_IDS.promoteRc.mockedPromoteRcBody),
    ).toBeInTheDocument();
  });
});
