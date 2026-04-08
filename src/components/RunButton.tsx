type RunButtonProps = {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
};

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
}

export function RunButton({ disabled = false, busy = false, onClick }: RunButtonProps) {
  const shortcut = isMac() ? "Cmd" : "Ctrl";

  return (
    <button
      className="btn btn-run"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {busy ? (
        <>
          <span className="spinner" />
          Running
        </>
      ) : (
        <>
          Run
          <span className="shortcut-hint">{shortcut}+Enter</span>
        </>
      )}
    </button>
  );
}
