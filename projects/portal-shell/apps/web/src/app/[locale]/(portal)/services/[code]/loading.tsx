import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function ServiceDetailLoading() {
  return (
    <Skeleton>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: 32 }}>
        <SkeletonItem shape="rectangle" style={{ height: 300 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <SkeletonItem shape="rectangle" style={{ height: 20, width: 120 }} />
          <SkeletonItem shape="rectangle" style={{ height: 36, width: '80%' }} />
          <SkeletonItem shape="rectangle" style={{ height: 80 }} />
          <SkeletonItem shape="rectangle" style={{ height: 44, width: 160 }} />
        </div>
      </div>
      <SkeletonItem shape="rectangle" style={{ height: 44 }} />
      <SkeletonItem shape="rectangle" style={{ height: 200, marginTop: 24 }} />
    </Skeleton>
  );
}
