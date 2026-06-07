const { spawn } = require("child_process");
const readline = require("readline");

class SearchEngineClient {
  constructor(options) {
    this.executablePath = options.executablePath;
    this.datasetPath = options.datasetPath;
    this.child = null;
    this.lineReader = null;
    this.ready = null;
    this.pending = [];
    this.currentRequest = null;
    this.stderrBuffer = [];
    this.isStopping = false;
  }

  async start() {
    if (this.ready) {
      return this.ready;
    }

    this.isStopping = false;
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(this.executablePath, [this.datasetPath, "--api"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      this.child = child;
      this.stderrBuffer = [];

      const handleSpawnError = (error) => {
        this.ready = null;
        reject(new Error(`Failed to start search engine: ${error.message}`));
      };

      child.once("error", handleSpawnError);

      child.once("spawn", () => {
        child.removeListener("error", handleSpawnError);
        this.attachProcessListeners(child);
        resolve();
      });
    });

    return this.ready;
  }

  async sendCommand(command, timeoutMs) {
    await this.start();

    return new Promise((resolve, reject) => {
      const request = {
        command,
        resolve,
        reject,
        timer: setTimeout(() => {
          if (this.currentRequest === request) {
            this.currentRequest = null;
          } else {
            this.pending = this.pending.filter((item) => item !== request);
          }

          reject(new Error(`Timed out waiting for search engine response to "${command}"`));
        }, timeoutMs),
      };

      this.pending.push(request);
      this.flushQueue();
    });
  }

  async stop() {
    this.isStopping = true;

    if (!this.child) {
      this.ready = null;
      return;
    }

    try {
      this.child.stdin.write("exit\n");
    } catch (_error) {
      // Shutdown should continue even if the child process already closed stdin.
    }

    this.child.kill();
    this.cleanupChild();
    this.ready = null;
  }

  attachProcessListeners(child) {
    this.lineReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    this.lineReader.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (this.stderrBuffer.length >= 20) {
        this.stderrBuffer.shift();
      }
      this.stderrBuffer.push(text.trim());
    });

    child.on("exit", (code, signal) => {
      const errorMessage = this.buildExitMessage(code, signal);
      this.failCurrentAndQueued(new Error(errorMessage));
      this.cleanupChild();

      if (!this.isStopping) {
        this.ready = null;
      }
    });
  }

  buildExitMessage(code, signal) {
    const stderrText = this.stderrBuffer.filter(Boolean).join(" | ");
    const baseMessage = `Search engine exited unexpectedly (code=${code}, signal=${signal || "none"})`;
    return stderrText ? `${baseMessage}: ${stderrText}` : baseMessage;
  }

  cleanupChild() {
    if (this.lineReader) {
      this.lineReader.close();
      this.lineReader = null;
    }
    this.child = null;
  }

  failCurrentAndQueued(error) {
    if (this.currentRequest) {
      clearTimeout(this.currentRequest.timer);
      this.currentRequest.reject(error);
      this.currentRequest = null;
    }

    while (this.pending.length > 0) {
      const request = this.pending.shift();
      clearTimeout(request.timer);
      request.reject(error);
    }
  }

  flushQueue() {
    if (this.currentRequest || this.pending.length === 0 || !this.child) {
      return;
    }

    this.currentRequest = this.pending.shift();

    try {
      this.child.stdin.write(`${this.currentRequest.command}\n`);
    } catch (error) {
      clearTimeout(this.currentRequest.timer);
      this.currentRequest.reject(new Error(`Failed to write to search engine stdin: ${error.message}`));
      this.currentRequest = null;
      this.ready = null;
    }
  }

  handleStdoutLine(line) {
    if (!this.currentRequest) {
      return;
    }

    const request = this.currentRequest;
    this.currentRequest = null;
    clearTimeout(request.timer);

    try {
      const parsed = JSON.parse(line);
      request.resolve(parsed);
    } catch (_error) {
      request.reject(new Error(`Invalid JSON from search engine: ${line}`));
    }

    this.flushQueue();
  }
}

module.exports = SearchEngineClient;
