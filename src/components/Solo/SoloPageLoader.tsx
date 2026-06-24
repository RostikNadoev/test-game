import { type CSSProperties } from 'react';

export const SoloPageLoader = () => {
  return (
    <div className="solo-loader-page">
      <div className="solo-loader-orb" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <p className="solo-loader-kicker">
        Loading solo zone
      </p>

      <div className="solo-loader-stack" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="solo-loader-card"
            style={{ '--loader-delay': `${index * 70}ms` } as CSSProperties}
          >
            <span />
            <div>
              <i />
              <b />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
