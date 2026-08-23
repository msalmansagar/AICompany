import { useState } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { renderableImageUrl } from '@qdb/shared';
import { DynamicIcon } from './DynamicIcon';

const MARK_SIZE = 40;

const useStyles = makeStyles({
  mark: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: `${MARK_SIZE}px`,
    height: `${MARK_SIZE}px`,
    color: tokens.colorNeutralForeground2,
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    // Fit the whole logo inside the box rather than cropping it — a maker's image is
    // rarely square, and a cropped logo reads as a broken one.
    objectFit: 'contain',
  },
});

interface FormMarkProps {
  imageUrl?: string;
  iconName?: string;
  /** Used for the image's alt text, so the mark is not announced as an unnamed graphic. */
  formTitle: string;
}

/**
 * The form's own mark, shown beside the title: a maker-supplied image, else a Fluent icon,
 * else nothing at all.
 *
 * An image wins over an icon because it is the more specific choice — a maker who supplies
 * both has gone to the trouble of hosting a picture.
 *
 * A broken image is rendered as nothing rather than as a broken-image glyph. The URL points
 * at a third-party host, so it can fail for reasons no one here controls (the host is down,
 * the CSP blocks it, the file moved), and a form header is the wrong place to advertise it.
 */
export function FormMark({ imageUrl, iconName, formTitle }: FormMarkProps) {
  const styles = useStyles();
  const [hasImageFailed, setHasImageFailed] = useState(false);

  const safeImageUrl = renderableImageUrl(imageUrl);

  if (safeImageUrl && !hasImageFailed) {
    return (
      <div className={styles.mark}>
        <img
          className={styles.image}
          src={safeImageUrl}
          alt={`${formTitle} logo`}
          onError={() => setHasImageFailed(true)}
        />
      </div>
    );
  }

  if (iconName) {
    return (
      <div className={styles.mark} aria-hidden="true">
        <DynamicIcon iconName={iconName} size={32} />
      </div>
    );
  }

  return null;
}
