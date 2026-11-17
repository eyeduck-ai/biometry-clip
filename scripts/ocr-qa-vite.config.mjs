// Local QA server keeps long-running OCR intact while source files are edited.
import config from '../vite.config.js';
export default {...config,server:{...config.server,hmr:false}};
