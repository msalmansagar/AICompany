import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function RequestDetailLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 300, marginBottom: 16 }} />
      <SkeletonItem shape="rectangle" style={{ height: 20, width: 200, marginBottom: 32 }} />
      <SkeletonItem shape="rectangle" style={{ height: 120, marginBottom: 24 }} />
      <SkeletonItem shape="rectangle" style={{ height: 200 }} />
    </Skeleton>
  );
}
