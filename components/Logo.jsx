// Brand lockup extracted from the supplied Albasrawie identity sheet.
// Two raster variants are shipped so the wordmark stays legible on both themes.
export function LogoMark({ size = 32, color = "var(--sky)", className }) {
  return (
    <svg viewBox="160 60 220 440" width={(size * 220) / 440} height={size} className={className} aria-hidden="true">
      <path fill={color} d="M362 102 C335 92 300 70 268 70 C215 72 172 112 172 162 C172 205 205 232 240 248 C262 258 292 268 308 275 L310 262 C310 240 292 224 276 206 C262 190 258 172 268 152 C278 132 300 122 322 119 C342 116 356 108 362 102 Z" />
      <circle fill={color} cx="288" cy="385" r="96" />
    </svg>
  );
}

export function Logo({ size = 26, href, className = "" }) {
  const art = (
    <>
      <img className="logo-light" src="/brand/logo.png" alt="Albasrawie" />
      <img className="logo-dark" src="/brand/logo-dark.png" alt="" aria-hidden="true" />
    </>
  );
  const style = { "--logo-h": `${size}px` };
  return href ? (
    <a href={href} className={`logo ${className}`} style={style} aria-label="Albasrawie home">
      {art}
    </a>
  ) : (
    <span className={`logo ${className}`} style={style}>
      {art}
    </span>
  );
}
