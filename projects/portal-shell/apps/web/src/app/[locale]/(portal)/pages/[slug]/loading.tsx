import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function CmsPageLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 44, width: '60%', marginBottom: 24 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonItem key={i} shape="rectangle" style={{ height: 18 }} />
        ))}
        <SkeletonItem shape="rectangle" style={{ height: 18, width: '70%' }} />
      </div>
    </Skeleton>
  );
}
