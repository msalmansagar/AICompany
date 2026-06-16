import React from 'react';
import {
  Card,
  CardHeader,
  CardPreview,
  CardFooter,
  Text,
  Badge,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { ArrowRightRegular } from '@fluentui/react-icons';

interface ServiceCardProps {
  code: string;
  title: string;
  description: string;
  category: string;
  imageUrl: string | null;
  locale: string;
  viewDetailsLabel?: string;
}

const useStyles = makeStyles({
  card: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  heroImage: {
    width: '100%',
    height: '180px',
    objectFit: 'cover',
  },
  description: {
    color: tokens.colorNeutralForeground2,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
    overflow: 'hidden',
    flex: 1,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalS,
  },
});

export function ServiceCard({
  code,
  title,
  description,
  category,
  imageUrl,
  locale,
  viewDetailsLabel = 'View Details',
}: ServiceCardProps) {
  const styles = useStyles();

  return (
    <Card className={styles.card} appearance="outline">
      {imageUrl && (
        <CardPreview>
          <img
            src={imageUrl}
            alt={`${title} service illustration`}
            className={styles.heroImage}
          />
        </CardPreview>
      )}
      <CardHeader
        header={<Text weight="semibold" size={400}>{title}</Text>}
        description={<Badge appearance="tint" color="brand">{category}</Badge>}
      />
      <Text className={styles.description} size={300}>
        {description}
      </Text>
      <CardFooter>
        <div className={styles.footer}>
          <a href={`/${locale}/services/${code}`} aria-label={`${viewDetailsLabel} — ${title}`}>
            <Button appearance="primary" icon={<ArrowRightRegular />} iconPosition="after">
              {viewDetailsLabel}
            </Button>
          </a>
        </div>
      </CardFooter>
    </Card>
  );
}
