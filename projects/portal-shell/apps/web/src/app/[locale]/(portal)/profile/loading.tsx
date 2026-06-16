import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function ProfileLoading() {
  return (
    <Skeleton>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: 32 }}>
        <SkeletonItem shape="circle" style={{ width: 80, height: 80 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <SkeletonItem shape="rectangle" style={{ height: 24, width: 200 }} />
          <SkeletonItem shape="rectangle" style={{ height: 16, width: 160 }} />
        </div>
      </div>
      <SkeletonItem shape="rectangle" style={{ height: 300 }} />
    </Skeleton>
  );
}
