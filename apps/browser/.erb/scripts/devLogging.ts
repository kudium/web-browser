/** A window closing/reloading can cancel an otherwise healthy asset response. */
export function isCancelledAssetResponse(
  origin: string,
  type: string,
  args: unknown[]
) {
  const error = args[1];
  return (
    origin === 'webpack-dev-middleware' &&
    type === 'error' &&
    args[0] === 'Stream error:' &&
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}
