import type { CSSProperties } from 'react';

const defaultAvatar = '/passenger-avatar-default.svg';
const legacyAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde';

export default function DriverAvatar({ avatar, style }: { avatar?: string; style?: CSSProperties }) {
  const url = typeof avatar === 'string' ? avatar.trim() : '';
  return (
    <img src={url && url.split('?')[0] !== legacyAvatar ? url : defaultAvatar} alt="" style={style}
      onError={event => {
        if (event.currentTarget.getAttribute('src') !== defaultAvatar) event.currentTarget.src = defaultAvatar;
      }} />
  );
}
