import React from 'react';
import { Skeleton, SkeletonItem, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: tokens.spacingHorizontalL,
  },
  skeletonHeader: {
    marginBottom: tokens.spacingVerticalXL,
  },
});

export default function DashboardLoading() {
  return (
    <div>
      <Skeleton>
        <SkeletonItem shape="rectangle" style={{ height: 32, width: 300, marginBottom: 24 }} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '24px',
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <SkeletonItem key={i} shape="rectangle" style={{ height: 160, gridColumn: 'span 2' }} />
          ))}
        </div>
      </Skeleton>
    </div>
  );
}
