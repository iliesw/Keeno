import { mount } from '@inflector/keeno'
import Pages from 'virtual:keeno-pages'
import './app.css'

// Routes come from the files in src/pages (see vite.config.ts).
mount(Pages, document.getElementById('app')!)
