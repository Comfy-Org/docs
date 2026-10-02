export const PricingCurrencyToggle = ({ children, creditsLabel, usdLabel }) => {
  const [showUsd, setShowUsd] = useState(false);
  const toggleCurrency = () => setShowUsd((current) => !current);

  return (
    <div className="router-pricing-currency">
      <style>{`
        .router-pricing-currency-control-row { display: flex; align-items: center; gap: 0.5rem; }
        .router-pricing-currency-control {
          display: inline-flex; align-items: center; gap: 0.65rem; margin: 0.5rem 0 1rem;
          padding: 0.4rem 0.6rem; border: 1px solid #8886; border-radius: 999px;
          background: transparent; color: inherit; font: inherit; cursor: pointer;
        }
        .router-pricing-currency-control:focus-visible { outline: 2px solid #7188ff; outline-offset: 2px; }
        .router-pricing-currency-track {
          display: inline-flex; align-items: center; width: 2.2rem; height: 1.2rem;
          padding: 0.12rem; border-radius: 999px; background: #8888; box-sizing: border-box;
        }
        .router-pricing-currency-thumb {
          width: 0.92rem; height: 0.92rem; border-radius: 50%; background: #fff;
          box-shadow: 0 1px 3px #0005; transition: transform 120ms ease;
        }
      `}</style>
      <div className="router-pricing-currency-control-row">
        <button
          type="button"
          role="switch"
          aria-checked={showUsd}
          aria-label={showUsd ? `Show prices in ${creditsLabel}` : `Show prices in ${usdLabel}`}
          className="router-pricing-currency-control"
          onClick={toggleCurrency}
        >
          <span>{creditsLabel}</span>
          <span className="router-pricing-currency-track" aria-hidden="true">
            <span
              className="router-pricing-currency-thumb"
              style={{ transform: showUsd ? "translateX(1rem)" : "translateX(0)" }}
            />
          </span>
          <span>{usdLabel}</span>
        </button>
      </div>
      {Array.isArray(children) ? children[showUsd ? 1 : 0] : children}
    </div>
  );
};
