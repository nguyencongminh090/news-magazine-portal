import { formatDate } from '../lib/format.js';
import { Icon } from './Icon.jsx';

/** Publication date with a clock cue; renders nothing without a valid date. */
export function DateMeta({ iso }) {
  const date = formatDate(iso);
  if (!date) return null;
  return <span className="meta"><span><Icon name="clock" /><time dateTime={iso}>{date}</time></span></span>;
}
