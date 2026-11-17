import './qa.css';
import * as api from './platform.js';
import { createQaRunner } from './runner.js';
import { mountQaApp } from './ui.js';

mountQaApp({document,window,api,createRunner:createQaRunner});
