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
import React, { useEffect, useState } from 'react';
import { green, red } from '@material-ui/core/colors';
import {
  IconButton,
  ListItem,
  ListItemIcon,
  ListItemText,
  makeStyles,
} from '@material-ui/core';
import CheckCircleOutline from '@material-ui/icons/CheckCircleOutline';
import ErrorOutlineIcon from '@material-ui/icons/ErrorOutline';
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import OpenInNewIcon from '@material-ui/icons/OpenInNew';

import { TEST_IDS } from '../../test-helpers/test-ids';
import { ResponseStep } from '../../types/types';

interface ResponseStepListItemProps {
  responseStep: ResponseStep;
  index: number;
  animationDelay?: number;
}

const useStyles = makeStyles({
  item: {
    transition: `opacity ${(props: any) =>
      props.animationDelay <= 0
        ? 0
        : Math.ceil(props.animationDelay / 2)}ms ease-in`,
    overflow: 'hidden',
    '&:before': {
      flex: 'none',
    },
  },
  hidden: {
    opacity: 0,
    height: 0,
    minHeight: 0,
  },
  shown: {
    opacity: 1,
  },
});

export const ResponseStepListItem = ({
  responseStep,
  index,
  animationDelay = 300,
}: ResponseStepListItemProps) => {
  const classes = useStyles({ animationDelay });
  const [renderMe, setRenderMe] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setRenderMe(true);
    }, animationDelay * index);

    return () => clearTimeout(timeoutId);
  }, [animationDelay, index, setRenderMe]);

  function ItemIcon() {
    if (responseStep.icon === 'success') {
      return (
        <CheckCircleOutline
          data-testid={TEST_IDS.components.responseStepListItemIconSuccess}
          style={{ color: green[500] }}
        />
      );
    }

    if (responseStep.icon === 'failure') {
      return (
        <ErrorOutlineIcon
          data-testid={TEST_IDS.components.responseStepListItemIconFailure}
          style={{ color: red[500] }}
        />
      );
    }

    if (responseStep.link) {
      return (
        <IconButton
          data-testid={TEST_IDS.components.responseStepListItemIconLink}
          style={{ padding: 0 }}
          aria-label="link"
          onClick={() => {
            const newTab = window.open(responseStep.link, '_blank');
            newTab?.focus();
          }}
        >
          <OpenInNewIcon color="primary" />
        </IconButton>
      );
    }

    return (
      <FiberManualRecordIcon
        data-testid={TEST_IDS.components.responseStepListItemIconDefault}
        fontSize="small"
        style={{ opacity: 0.85 }}
      />
    );
  }

  return (
    <ListItem
      className={`${classes.item} ${renderMe ? classes.shown : classes.hidden}`}
      data-testid={TEST_IDS.components.responseStepListItem}
    >
      <ListItemIcon>
        <ItemIcon />
      </ListItemIcon>

      <ListItemText
        primary={responseStep.message}
        secondary={responseStep.secondaryMessage}
      />
    </ListItem>
  );
};
