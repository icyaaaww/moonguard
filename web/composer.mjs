export function initComposer({ getFiles, submit }) {
  const $ = id => document.getElementById(id);
  let operations = [];
  const labels = { move: '移动', create: '新建', write: '修改', trash: '回收' };
  function render() {
    $('operation-list').replaceChildren();
    operations.forEach((op, index) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = `${labels[op.kind]} ${op.path}${op.to ? ` → ${op.to}` : ''}`;
      const remove = document.createElement('button');
      remove.className = 'quiet'; remove.textContent = '移除';
      remove.setAttribute('aria-label', `移除第 ${index + 1} 项操作`);
      remove.addEventListener('click', () => { operations.splice(index, 1); render(); });
      li.append(text, remove); $('operation-list').append(li);
    });
    $('operation-preview').disabled = !operations.length;
    $('operation-add').disabled = operations.length >= 200;
  }
  function fields() {
    const kind = $('operation-kind').value;
    $('operation-to-field').hidden = kind !== 'move';
    $('operation-content-field').hidden = !['create', 'write'].includes(kind);
    $('operation-load').hidden = kind !== 'write';
  }
  $('operation-kind').addEventListener('change', fields);
  $('operation-load').addEventListener('click', () => {
    const file = getFiles().find(f => f.path === $('operation-path').value.trim());
    $('operation-error').textContent = file ? '' : '没有找到可读取的文件，请检查路径。';
    if (file) $('operation-content').value = file.content;
  });
  $('operation-add').addEventListener('click', () => {
    const kind = $('operation-kind').value, filePath = $('operation-path').value.trim();
    const to = $('operation-to').value.trim();
    if (!filePath || (kind === 'move' && !to)) { $('operation-error').textContent = '请填写文件路径和需要的目标路径。'; return; }
    operations.push({ kind, path: filePath, ...(kind === 'move' ? { to } : {}), ...(['create', 'write'].includes(kind) ? { content: $('operation-content').value } : {}) });
    $('operation-error').textContent = ''; render();
  });
  $('operation-preview').addEventListener('click', () => {
    if (!operations.length) return;
    submit({ title: `自定义文件计划 · ${operations.length} 个操作`, operations: structuredClone(operations) });
    $('compose-dialog').close();
  });
  return {
    open(selected) {
      $('workspace-files').replaceChildren(...getFiles().map(f => { const option = document.createElement('option'); option.value = f.path; return option; }));
      $('operation-path').value = selected ?? '';
      $('operation-error').textContent = ''; fields(); render(); $('compose-dialog').showModal();
    },
    reset() { operations = []; $('operation-content').value = ''; $('operation-to').value = ''; render(); },
  };
}
