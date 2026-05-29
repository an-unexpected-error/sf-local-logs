/**
 * Watch mode monitoring utility for trace flags.
 *
 * Implements a polling loop with progress bar display to monitor TraceFlag expiry.
 * Handles graceful shutdown via SIGINT (Ctrl+C) signal.
 *
 * Provides: watchTraceFlag function that continuously monitors until trace expires or user interrupts.
 */

import cliProgress from 'cli-progress';
import { Org } from '@salesforce/core';

/**
 * Watch and monitor a TraceFlag until expiration or user interruption.
 *
 * Implementation details:
 * - Starts a progress bar showing time remaining and expiry timestamp
 * - Polls every 1 second (1000ms) to check remaining time
 * - Registers SIGINT handler for graceful Ctrl+C shutdown
 * - Stops progress bar before exiting to restore terminal state
 * - Exits when trace expiration time is reached or user presses Ctrl+C
 *
 * @param org - Authenticated Org instance (for potential future queries)
 * @param traceId - TraceFlag ID being monitored
 * @param expirationDate - ISO 8601 string representing when trace expires
 * @param logger - Object with log() method for status messages
 * @returns Promise<void> - Resolves when monitoring completes (either by expiry or interrupt)
 */
export async function watchTraceFlag(
  _org: Org,
  _traceId: string,
  expirationDate: string,
  logger: { log: (msg: string) => void }
): Promise<void> {
  // Calculate expiration time in milliseconds
  const expireTime = new Date(expirationDate).getTime();
  const maxDuration = 24 * 3600 * 1000; // 24 hours in milliseconds

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

  // Start progress bar at 0% (0 time elapsed)
  const startTime = Date.now();
  progressBar.start(maxDuration, 0, {
    expiry: new Date(expirationDate).toLocaleTimeString('en', { timeZone: 'UTC' }),
  });

  // Define and register SIGINT handler for graceful shutdown
  const onSignal = () => {
    logger.log(''); // newline for cleanliness
    progressBar.stop();
    logger.log('Monitoring interrupted.');
    process.exit(0);
  };
  process.on('SIGINT', onSignal);

  // Polling loop: check remaining time every second
  const intervalId = setInterval(() => {
    try {
      const now = Date.now();
      const remaining = Math.max(0, expireTime - now);
      const remainingMinutes = Math.floor(remaining / 60000);

      // Calculate progress value: time elapsed (0 to maxDuration)
      const timeElapsed = now - startTime;
      const progressValue = Math.min(timeElapsed, maxDuration);

      // Update progress bar with current progress and time remaining
      progressBar.update(progressValue, {
        expiry: new Date(expirationDate).toLocaleTimeString('en', { timeZone: 'UTC' }),
        value: remainingMinutes,
      });

      // Check if trace has expired
      if (remaining <= 0) {
        clearInterval(intervalId);
        process.removeListener('SIGINT', onSignal);
        progressBar.stop();
        logger.log('Trace flag expired. No more logs will be generated.');
        return;
      }
    } catch (error) {
      // Ensure cleanup even if error occurs
      clearInterval(intervalId);
      process.removeListener('SIGINT', onSignal);
      progressBar.stop();
      throw error;
    }
  }, 1000); // Poll every 1 second
}
