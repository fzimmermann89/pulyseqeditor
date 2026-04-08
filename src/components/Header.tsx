import { RunButton } from "./RunButton";
import packageJson from "../../package.json";

type HeaderProps = {
  status: string;
  busy: boolean;
  onOpen: () => void;
  onRun: () => void;
  canInstall: boolean;
  installSupported: boolean;
  onInstall: () => void;
};

export function Header({
  status,
  busy,
  onOpen,
  onRun,
  canInstall,
  installSupported,
  onInstall,
}: HeaderProps) {
  const iconUrl = `${import.meta.env.BASE_URL}pulseq-icon.png`;
  const pypulseqVersion = packageJson.pypulseq.version;

  return (
    <header className="header">
      <div className="header-brand">
        <img
          src={iconUrl}
          alt="pypulseq"
          className="header-logo-img"
        />
        <span className="header-title">pypulseq</span>
        <span className="header-version">{pypulseqVersion}</span>
        {installSupported ? (
          <button
            type="button"
            className="install-button"
            aria-label="Install app"
            title={canInstall ? "Install" : "Install unavailable"}
            onClick={onInstall}
            disabled={!canInstall}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="install-icon"
            >
              <path
                d="M12 3v10m0 0 4-4m-4 4-4-4M5 17v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="header-controls">
        <span className="status-indicator" data-status={status.toLowerCase()}>
          <span className="status-dot" />
          {status}
        </span>
        <button type="button" className="btn btn-secondary" onClick={onOpen} disabled={busy}>
          Open
        </button>
        <RunButton onClick={onRun} busy={busy} disabled={busy} />
      </div>
    </header>
  );
}
