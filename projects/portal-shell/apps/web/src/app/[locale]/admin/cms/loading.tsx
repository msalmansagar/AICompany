'use client';

import React from 'react';
import { Skeleton, SkeletonItem } from '@fluentui/react-components';

export default function AdminCmsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Command bar skeleton */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #EDEBE9',
          padding: '10px 16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <Skeleton>
          <SkeletonItem shape="rectangle" style={{ height: 28, width: 80, borderRadius: 4 }} />
        </Skeleton>
        <Skeleton>
          <SkeletonItem shape="rectangle" style={{ height: 28, width: 80, borderRadius: 4 }} />
        </Skeleton>
      </div>

      {/* Record header skeleton */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #EDEBE9',
          padding: '16px 28px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '8px' }}>
          <Skeleton>
            <SkeletonItem shape="square" style={{ width: 40, height: 40, borderRadius: 8 }} />
          </Skeleton>
          <div>
            <Skeleton>
              <SkeletonItem shape="rectangle" style={{ height: 20, width: 220, borderRadius: 4, marginBottom: 6 }} />
            </Skeleton>
            <Skeleton>
              <SkeletonItem shape="rectangle" style={{ height: 14, width: 100, borderRadius: 4 }} />
            </Skeleton>
          </div>
        </div>
      </div>

      {/* Grid rows skeleton */}
      <div style={{ flex: 1, backgroundColor: '#F3F2F1', padding: '0' }}>
        <div style={{ backgroundColor: '#FFFFFF' }}>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div
              key={i}
              style={{
                borderBottom: '1px solid #EDEBE9',
                padding: '14px 24px',
                display: 'flex',
                gap: '24px',
              }}
            >
              <Skeleton style={{ flex: 2 }}>
                <SkeletonItem shape="rectangle" style={{ height: 14, borderRadius: 4 }} />
              </Skeleton>
              <Skeleton style={{ flex: 1 }}>
                <SkeletonItem shape="rectangle" style={{ height: 14, borderRadius: 4 }} />
              </Skeleton>
              <Skeleton style={{ width: 80 }}>
                <SkeletonItem shape="rectangle" style={{ height: 20, borderRadius: 10 }} />
              </Skeleton>
              <Skeleton style={{ flex: 1 }}>
                <SkeletonItem shape="rectangle" style={{ height: 14, borderRadius: 4 }} />
              </Skeleton>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
