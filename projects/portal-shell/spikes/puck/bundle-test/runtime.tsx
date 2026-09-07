/**
 * The VISITOR bundle, per ADR-CMS-004: our own renderer, no Puck.
 * Same block library, same page — only the rendering path differs.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderTree } from '../runtime/renderTree';
import { reyadaConfig } from '../reyada.config';
import { reyadaData } from '../reyada.data';

const el = document.getElementById('root');
if (el) createRoot(el).render(renderTree(reyadaConfig, reyadaData, { locale: 'en' }));
