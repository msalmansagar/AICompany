import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function ServicesLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 240, marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonItem key={i} shape="rectangle" style={{ height: 200 }} />
        ))}
      </div>
    </Skeleton>
  );
}
