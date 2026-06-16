import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function AnnouncementsLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 240, marginBottom: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SkeletonItem shape="rectangle" style={{ height: 22, width: '70%' }} />
            <SkeletonItem shape="rectangle" style={{ height: 16, width: '30%' }} />
            <SkeletonItem shape="rectangle" style={{ height: 16 }} />
            <SkeletonItem shape="rectangle" style={{ height: 16, width: '85%' }} />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
