// One shared SVG sprite (rendered once by PublicLayout) + <Icon name='...'/> that references it. Stroke 1.8, 20px (DESIGN.md).
export function IconSprite() {
  return (
    <svg width='0' height='0' style={{ position: 'absolute' }} aria-hidden='true' focusable='false'>
      <defs>
      <symbol id='i-landmark' viewBox='0 0 24 24'><path d='M3 21h18M5 21V10m14 11V10M9 21V10m6 11V10M3 10l9-6 9 6z'/></symbol>
      <symbol id='i-ball' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9'/><path d='m12 8 3.5 2.5-1.3 4h-4.4l-1.3-4z M12 3v5m3.5 2.5L20 9m-5.8 6 3 3.5M9.8 15l-3 3.5M8.5 10.5 4 9'/></symbol>
      <symbol id='i-atom' viewBox='0 0 24 24'><circle cx='12' cy='12' r='1.8'/><ellipse cx='12' cy='12' rx='10' ry='4'/><ellipse cx='12' cy='12' rx='10' ry='4' transform='rotate(60 12 12)'/><ellipse cx='12' cy='12' rx='10' ry='4' transform='rotate(120 12 12)'/></symbol>
      <symbol id='i-heart' viewBox='0 0 24 24'><path d='M12 20.5S3 15 3 8.8A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 9 2.2c0 6.200-9 11.700-9 11.700z'/><path d='M6 12h3l1.500-3 3 6 1.500-3h3'/></symbol>
      <symbol id='i-scale' viewBox='0 0 24 24'><path d='M12 3v18M7 21h10M5 7h14M5 7l-3 7a3.500 3 0 0 0 6 0zM19 7l-3 7a3.500 3 0 0 0 6 0z'/></symbol>
      <symbol id='i-leaf' viewBox='0 0 24 24'><path d='M20 4C9 4 4 9 4 15c0 2 .8 3.500 2 5 1.500-5 5-8 9-9.500-3.500 2.500-6 5.500-7 9.500 8 1 12-4.500 12-16z'/></symbol>
      <symbol id='i-alert' viewBox='0 0 24 24'><path d='M12 3 2 20h20L12 3z'/><path d='M12 10v5m0 3v.01'/></symbol>
      <symbol id='i-cloud' viewBox='0 0 24 24'><path d='M7 18a4.500 4.500 0 0 1-.5-9 6 6 0 0 1 11.500 1.500A3.800 3.800 0 0 1 17.500 18z'/><path d='M12 3v1.500M4.500 6l1 1M19.500 6l-1 1'/></symbol>
      <symbol id='i-clock' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/></symbol>
      <symbol id='i-chat' viewBox='0 0 24 24'><path d='M4 5h16v11H9l-5 4z'/></symbol>
      <symbol id='i-bookmark' viewBox='0 0 24 24'><path d='M6 3h12v18l-6-4-6 4z'/></symbol>
      <symbol id='i-search' viewBox='0 0 24 24'><circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/></symbol>
      <symbol id='i-menu' viewBox='0 0 24 24'><path d='M4 7h16M4 12h16M4 17h16'/></symbol>
      <symbol id='i-close' viewBox='0 0 24 24'><path d='M5 5l14 14M19 5 5 19'/></symbol>
      <symbol id='i-star' viewBox='0 0 24 24'><path d='m12 3 2.800 5.800 6.200.9-4.500 4.400 1.100 6.200L12 17.300 6.400 20.300l1.100-6.200L3 9.700l6.200-.9z'/></symbol>
      <symbol id='i-home' viewBox='0 0 24 24'><path d='M3 11 12 3l9 8M5 9.500V21h14V9.500'/></symbol>
      <symbol id='i-user' viewBox='0 0 24 24'><circle cx='12' cy='8' r='4'/><path d='M4 21c0-4 3.500-6 8-6s8 2 8 6'/></symbol>
      <symbol id='i-arrow' viewBox='0 0 24 24'><path d='M5 12h14m-6-6 6 6-6 6'/></symbol>
      <symbol id='i-flag' viewBox='0 0 24 24'><path d='M5 21V4m0 1h12l-2.500 4L17 13H5'/></symbol>
      <symbol id='i-link' viewBox='0 0 24 24'><path d='M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1'/></symbol>
      <symbol id='i-eye' viewBox='0 0 24 24'><path d='M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/></symbol>
      <symbol id='i-bulb' viewBox='0 0 24 24'><path d='M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.500 10.900c.7.600 1 1.300 1 2.100h5c0-.8.300-1.500 1-2.100A6 6 0 0 0 12 3z'/></symbol>
      <symbol id='i-sun' viewBox='0 0 24 24'><circle cx='12' cy='12' r='4'/><path d='M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.500 1.500M17.500 17.500 19 19M19 5l-1.500 1.500M6.500 17.500 5 19'/></symbol>
      <symbol id='i-bookmarks' viewBox='0 0 24 24'><path d='M6 3h12v18l-6-4-6 4z'/></symbol>
      <symbol id='i-plus' viewBox='0 0 24 24'><path d='M12 5v14M5 12h14'/></symbol>
      </defs>
    </svg>
  );
}

export function Icon({ name, className = '', ...rest }) {
  return (
    <svg className={`ico ${className}`.trim()} aria-hidden='true' focusable='false' {...rest}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
