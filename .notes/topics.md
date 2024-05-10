## Server

hidden inputs
subclassing nodes
execution order
custom data types

Some real life examples

## Client


api events (addEventListener) (*)

The ComfyNode object
Inputs, outputs and widgets
Custom widgets  (*)
Adding to the menus (node, canvas) and preferences/settings
Other key JavaScript objects (prompt, app, graph, workflow) and methods you might want to hijack
Group nodes  (*)
Groups

Some real life examples


## Server-Client messaging:

overview
existing api calls
existing api events (search #addApiUpdateHandlers() in app)
adding python server calls (JS calling Python)
sending custom messages (Python messaging JS)

Some real life examples

## Bits and pieces

What changes require a Comfy restart v. page reload
Adding css 

        const head = document.getElementsByTagName('HEAD')[0];
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = 'extensions/cg-use-everywhere/ue.css';
        head.appendChild(link);


## Glossary

Probably good to define a bunch of things:
LiteGraph
graph
