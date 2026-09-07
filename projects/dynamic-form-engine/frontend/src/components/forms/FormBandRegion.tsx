import { useState } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';
import { renderableImageUrl } from '@qdb/shared';
import type { FormBand } from '@qdb/shared';

const useStyles = makeStyles({
  band: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  image: {
    maxWidth: '100%',
    height: 'auto',
    alignSelf: 'flex-start',
  },
  text: {
    margin: 0,
    fontSize: tokens.fontSizeBase300,
    color: tokens.colorNeutralForeground2,
    // The stored value is plain text. Preserving newlines is how a maker gets more than one
    // line without HTML, which the form side has no sanitiser for.
    whiteSpace: 'pre-wrap',
  },
});

interface FormBandRegionProps {
  band?: FormBand;
  /** 'banner' for the header, 'contentinfo' for the footer — the landmark roles for each. */
  landmark: 'banner' | 'contentinfo';
  /** Names the landmark and the image, so neither is announced as unlabelled. */
  label: string;
}

/**
 * A maker-authored band above or below the form.
 *
 * Renders nothing when the maker configured neither part, which is the case for every form
 * published before bands existed.
 *
 * A broken image collapses to nothing rather than a broken-image glyph, and the text stays:
 * the URL points at a host no one here controls, and losing the words because a picture
 * failed would be the worse outcome.
 */
export function FormBandRegion({ band, landmark, label }: FormBandRegionProps) {
  const styles = useStyles();
  const [hasImageFailed, setHasImageFailed] = useState(false);

  const safeImageUrl = renderableImageUrl(band?.imageUrl);
  const text = band?.text;
  const showImage = !!safeImageUrl && !hasImageFailed;

  if (!text && !showImage) return null;

  return (
    <div className={styles.band} role={landmark} aria-label={label}>
      {showImage && (
        <img
          className={styles.image}
          src={safeImageUrl}
          alt={label}
          onError={() => setHasImageFailed(true)}
        />
      )}
      {text && <p className={styles.text}>{text}</p>}
    </div>
  );
}
