import { type CSSProperties } from 'react';

export const SoloPageLoader = () => {
  return (
    <div className="solo-loader-page-v2">
      <div className="solo-loader-mark" aria-hidden="true">
        <span />
        <span />
      </div>

      <div className="solo-loader-list" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="solo-loader-line"
            style={{ '--loader-delay': `${index * 60}ms` } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
};
