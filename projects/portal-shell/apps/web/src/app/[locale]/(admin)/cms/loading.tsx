import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function AdminCmsLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 240, marginBottom: 24 }} />
      <SkeletonItem shape="rectangle" style={{ height: 44, marginBottom: 16 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonItem key={i} shape="rectangle" style={{ height: 52 }} />
        ))}
      </div>
    </Skeleton>
  );
}
