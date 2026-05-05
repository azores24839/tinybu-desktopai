const statusEl = document.getElementById("status");

document.querySelectorAll("button[data-kind]").forEach((button) => {
  button.addEventListener("click", async () => {
    statusEl.textContent = "正在捕捉并发送到 TinyBu...";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "NOMI_CAPTURE_ACTIVE_TAB",
        kind: button.dataset.kind
      });

      if (!response?.ok) {
        throw new Error(response?.error || "捕捉失败");
      }

      statusEl.textContent = "已发送到 TinyBu。";
      window.close();
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : "捕捉失败";
    }
  });
});
