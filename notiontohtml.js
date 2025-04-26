const { Client } = require('@notionhq/client');
const fs = require('fs');

// Basic console input
const readline = require('readline');

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
var pageID;
var integrationTOKEN;
rl.question('Enter Notion Integration Token: ', (answer) => {
	rl.question('Enter Notion Page ID: ', (answer2) => {
		pageID=answer;
		integrationTOKEN=answer2;
		rl.close();
		startScript();
	});
});

function startScript() {
	const notion = new Client({ auth: integrationTOKEN});
	const pageId = pageID; // Replace with your root page ID

	async function getBlocks(blockId) {
		const blocks = [];
		let cursor;
		while (true) {
			const { results, has_more, next_cursor } = await notion.blocks.children.list({
				block_id: blockId,
				start_cursor: cursor,
			});
			blocks.push(...results);
			if (!has_more) break;
			cursor = next_cursor;
		}
		return blocks;
	}

	async function renderDatabase(databaseId) {
		const { results } = await notion.databases.query({ database_id: databaseId });
		if (results.length === 0) return '<p><em>Empty database</em></p>';

		const properties = results[0].properties;
		const columns = Object.keys(properties);

		let table = '<table border="1" cellspacing="0" cellpadding="5"><tr>';
		for (const col of columns) {
			table += `<th>${col}</th>`;
		}
		table += '</tr>';

		for (const row of results) {
			table += '<tr>';
			for (const col of columns) {
				const val = row.properties[col];
				table += `<td>${extractPlainText(val)}</td>`;
			}
			table += '</tr>';
		}
		return table + '</table>';
	}

	function extractPlainText(val) {
		if (!val) return '';
		if (val.type === 'title' || val.type === 'rich_text') {
			return val[val.type].map(t => t.plain_text).join('');
		}
		if (val.type === 'select' || val.type === 'status') {
			return val[val.type]?.name || '';
		}
		if (val.type === 'multi_select') {
			return val.multi_select.map(s => s.name).join(', ');
		}
		if (val.type === 'number') return val.number;
		if (val.type === 'checkbox') return val.checkbox ? '✔' : '';
		return '[Unsupported]';
	}

	function blockToHTML(block) {
		const getText = (arr) => arr.map(t => t.plain_text || '').join('');
		switch (block.type) {
			case 'paragraph':
				return `<p>${getText(block.paragraph.rich_text)}</p>`;
			case 'heading_1':
				return `<h1>${getText(block.heading_1.rich_text)}</h1>`;
			case 'heading_2':
				return `<h2>${getText(block.heading_2.rich_text)}</h2>`;
			case 'heading_3':
				return `<h3>${getText(block.heading_3.rich_text)}</h3>`;
			case 'bulleted_list_item':
				return `<li>${getText(block.bulleted_list_item.rich_text)}</li>`;
			case 'numbered_list_item':
				return `<li>${getText(block.numbered_list_item.rich_text)}</li>`;
			case 'callout':
				return `<blockquote>${getText(block.callout.rich_text)}</blockquote>`;
			default:
				return `<p><em>Unsupported block: ${block.type}</em></p>`;
		}
	}

	async function renderBlocks(blocks) {
		let html = '';
		let inList = false;
		let currentListType = '';

		for (const block of blocks) {
			if (['bulleted_list_item', 'numbered_list_item'].includes(block.type)) {
				const listTag = block.type === 'bulleted_list_item' ? 'ul' : 'ol';
				if (!inList || currentListType !== listTag) {
					if (inList) html += `</${currentListType}>`;
					html += `<${listTag}>`;
					inList = true;
					currentListType = listTag;
				}
				html += blockToHTML(block);
			} else {
				if (inList) {
					html += `</${currentListType}>`;
					inList = false;
					currentListType = '';
				}

				if (block.type === 'child_page') {
					const page = await notion.pages.retrieve({ page_id: block.id });
					const childBlocks = await getBlocks(block.id);
					html += `<h2>${page.properties.title?.title[0]?.plain_text || 'Untitled Page'}</h2>`;
					html += await renderBlocks(childBlocks);
				} else if (block.type === 'child_database') {
					html += `<h3>Child Database</h3>`;
					html += await renderDatabase(block.id);
				} else {
					html += blockToHTML(block);
				}
			}
		}

		if (inList) html += `</${currentListType}>`;
		return html;
	}

	(async () => {
		const blocks = await getBlocks(pageId);
		const bodyContent = await renderBlocks(blocks);

		const fullHTML = `
  <html>
	 <head>
		<style>
		  body {
			 font-family: sans-serif;
			 padding: 20px;
			 max-width: 900px;
			 margin: auto;
			 line-height: 1.6;
			 background: #f9f9f9;
		  }
		  h1 { font-size: 2em; border-bottom: 2px solid #ccc; }
		  h2 { font-size: 1.5em; color: #444; margin-top: 2em; }
		  h3 { font-size: 1.2em; color: #555; margin-top: 1.5em; }
		  p { margin-bottom: 1em; }
		  ul, ol { padding-left: 20px; margin-bottom: 1em; }
		  li { margin-bottom: 0.5em; }
		  blockquote { padding-left: 20px; border-left: 3px solid #ccc; margin: 20px 0; font-style: italic; }
		  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
		  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
		  th { background: #eee; }
		</style>
	 </head>
	 <body>
		${bodyContent}
	 </body>
  </html>`;

		fs.writeFileSync('done.html', fullHTML);
		console.log('done.html exported');
	})();
}
