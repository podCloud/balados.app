const SYNC_URL = "https://sync.balados.app";

export const Explorer = () => {
  return (
    <div className="h-full pb-16 bg-white">
      <iframe
        src={SYNC_URL}
        title="Explorer"
        className="w-full h-full border-0"
        allow="clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
};
