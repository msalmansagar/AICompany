import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function NewsLoading() {
  return (
    <Skeleton>
      <SkeletonItem shape="rectangle" style={{ height: 32, width: 180, marginBottom: 24 }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '24px',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SkeletonItem shape="rectangle" style={{ height: 160 }} />
            <SkeletonItem shape="rectangle" style={{ height: 20, width: '60%' }} />
            <SkeletonItem shape="rectangle" style={{ height: 16 }} />
            <SkeletonItem shape="rectangle" style={{ height: 16, width: '80%' }} />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
