import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function MyRequestsLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 200, marginBottom: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonItem key={i} shape="rectangle" style={{ height: 72 }} />
        ))}
      </div>
    </Skeleton>
  );
}
