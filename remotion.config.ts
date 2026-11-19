import { Config } from "@remotion/cli/config";

// Les médias du Reel vivent dans remotion/public pour ne pas polluer le public/ de Vite.
Config.setPublicDir("remotion/public");
Config.setOverwriteOutput(true);
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(18);
