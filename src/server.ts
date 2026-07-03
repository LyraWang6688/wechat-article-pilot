import { createApp } from "./app.js";
import { appConfig } from "./config.js";

const app = createApp();

app.listen(appConfig.port, () => {
  console.log(`Feishu WeChat Bridge is running at http://localhost:${appConfig.port}`);
});
