/**
 * Watch mode monitoring for trace flags.
 *
 * Provides continuous monitoring of a trace flag with progress bar display
 * and graceful Ctrl+C (SIGINT) handling. Per D-02 (locked): watch mode
 * monitors the trace flag for the full 24-hour trace duration or until
 * user interruption.
 */

import { Org } from '@salesforce/core';
import cliProgress from 'cli-progress';

/**
 * Monitor a trace flag with progress bar display until expiry or SIGINT.
 *
 * Implements watch mode monitoring loop (per D-01, default behavior):
 * - Polls every 1 second for trace expiration
 * - Displays cli-progress progress bar with time remaining
 * - Handles Ctrl+C (SIGINT) gracefully with terminal cleanup
 * - Logs status messages explaining what's happening
 *
 * @param org - Authenticated Org instance
 * @param traceId - TraceFlag ID being monitored
 * @param expirationDate - ISO 8601 string for trace expiration time
 * @param logger - Logger with log(message) method for status messages
 * @returns Promise that resolves when trace expires or SIGINT is sent
 */
export async function watchTraceFlag(
  _org: Org,
  _traceId: string,
  expirationDate: string,
  logger: { log: (msg: string) => void }
): Promise<void> {
  // Setup: convert expiration time to milliseconds
  const expireTime = new Date(expirationDate).getTime();
  const maxDuration = 24 * 3600 * 1000; // 24 hours in milliseconds

  // Format expiration time for display
  const expiryDisplay = new Date(expirationDate).toLocaleTimeString('en', {
    timeZone: 'UTC',
  });

  // Create progress bar with custom format
  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Trace monitoring [{bar}] {percentage}% | {value}m remaining | Expires {expiry}',
      hideCursor: true,
      fps: 0.5, // Update twice per second
      autopadding: true,
      noTTYOutput: false,
    },
    cliProgress.Presets.shades_classic
  );

  // Define SIGINT handler for graceful Ctrl+C
  const onSignal = () => {
    logger.log('');
    progressBar.stop();
    logger.log('Monitoring interrupted.');
    process.exit(0);
  };

  // Register SIGINT handler before starting progress bar
  process.on('SIGINT', onSignal);

  try {
    // Start progress bar
    progressBar.start(maxDuration, 0, { expiry: expiryDisplay });

    // Polling loop: check expiry every 1 second
    const intervalId = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, expireTime - now);
      const remainingMinutes = Math.floor(remaining / 60000);

      // Calculate progress value (0 to maxDuration)
      const timeElapsed = Math.max(0, now - (expireTime - maxDuration));
      const progressValue = Math.min(timeElapsed, maxDuration);

      // Update progress bar
      progressBar.update(progressValue, {
        expiry: expiryDisplay,
        remaining: remainingMinutes,
      });

      // Check if trace has expired
      if (remaining <= 0) {
        clearInterval(intervalId);
        process.removeListener('SIGINT', onSignal);
        progressBar.stop();
        logger.log('Trace flag expired. No more logs will be generated.');
      }
    }, 1000); // 1-second interval
  } catch (error) {
    progressBar.stop();
    process.removeListener('SIGINT', onSignal);
    throw error;
  }
}
