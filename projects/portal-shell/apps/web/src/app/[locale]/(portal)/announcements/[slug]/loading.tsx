import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function AnnouncementDetailLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 40, width: '70%', marginBottom: 16 }} />
      <SkeletonItem shape="rectangle" style={{ height: 20, width: '40%', marginBottom: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[1, 2, 3, 4].map((i) => (
          <SkeletonItem key={i} shape="rectangle" style={{ height: 18 }} />
        ))}
      </div>
    </Skeleton>
  );
}
