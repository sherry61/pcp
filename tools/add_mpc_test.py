from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.etree import ElementTree as ET

SRC = Path('/home/xdd/.codex/attachments/f70fd395-adc6-4b82-b56f-918ac6f19559/测试大纲-隐私保护part.docx')
OUT = Path('/home/super/fqh/docs/测试大纲-隐私保护part-含MPC.docx')
TMP = Path('/tmp/mpc_docx_work')
WORD = 'word/document.xml'
NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ET.register_namespace('w', NS)
W = '{%s}' % NS

def texts(el):
    return el.findall('.//%st' % W)

def set_paragraph(p, value):
    ts = texts(p)
    if not ts:
        r = ET.SubElement(p, W+'r')
        ET.SubElement(r, W+'t').text = value
        return
    ts[0].text = value
    ts[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for t in ts[1:]:
        t.text = ''

def set_cell(cell, value):
    # Rebuild cell paragraphs from the cloned template. This removes the
    # source table's automatic numbering while retaining table/cell styling.
    old_p = cell.find(W+'p')
    ppr = deepcopy(old_p.find(W+'pPr')) if old_p is not None and old_p.find(W+'pPr') is not None else None
    if ppr is not None:
        num = ppr.find(W+'numPr')
        if num is not None:
            ppr.remove(num)
    old_r = old_p.find(W+'r') if old_p is not None else None
    rpr = deepcopy(old_r.find(W+'rPr')) if old_r is not None and old_r.find(W+'rPr') is not None else None
    tcpr = cell.find(W+'tcPr')
    for child in list(cell):
        if child is not tcpr:
            cell.remove(child)
    lines = value.split('\n') if value else ['']
    for li, line in enumerate(lines):
        p = ET.SubElement(cell, W+'p')
        if ppr is not None:
            p.append(deepcopy(ppr))
        r = ET.SubElement(p, W+'r')
        if rpr is not None:
            r.append(deepcopy(rpr))
        t = ET.SubElement(r, W+'t')
        t.text = line
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')

TMP.mkdir(parents=True, exist_ok=True)
with ZipFile(SRC) as z:
    z.extractall(TMP)

doc_path = TMP / WORD
tree = ET.parse(doc_path)
root = tree.getroot()
body = root.find(W+'body')
children = list(body)
paras = [x for x in children if x.tag == W+'p']
tables = [x for x in children if x.tag == W+'tbl']

# Use the existing heading, explanatory paragraph, caption and table as format templates.
heading_tpl = next(p for p in paras if ''.join(p.itertext()).strip() == '联邦学习测试')
intro_tpl = next(p for p in paras if '联邦学习能力' in ''.join(p.itertext()))
caption_tpl = next(p for p in paras if ''.join(p.itertext()).strip() == '表4-5联邦学习测试')
table_tpl = tables[-1]

# Correct the copied title typo in the source's federated-learning table.
for idx, elem in enumerate(list(body)):
    if elem.tag == W+'p' and ''.join(elem.itertext()).strip() == '表4-5联邦学习测试':
        if idx + 1 < len(list(body)) and list(body)[idx + 1].tag == W+'tbl':
            old_tbl = list(body)[idx + 1]
            old_rows = old_tbl.findall(W+'tr')
            if old_rows:
                set_cell(old_rows[0].findall(W+'tc')[1], '隐私计算平台中联邦学习功能测试')
        break

heading = deepcopy(heading_tpl)
set_paragraph(heading, '多方安全计算测试')
intro = deepcopy(intro_tpl)
set_paragraph(intro, '验证数字资产流通原型系统的隐私保护计算中多方安全计算能力，检查参与方在不直接暴露各自原始数据的条件下，能否通过协同计算完成约定任务并返回正确结果。')
caption = deepcopy(caption_tpl)
set_paragraph(caption, '表4-6多方安全计算测试')
table = deepcopy(table_tpl)

values = [
    ('测试项目', '隐私计算平台中多方安全计算功能测试'),
    ('测试目的', '验证在提供方、使用方及计算服务协同参与的场景下，多方安全计算模块能否正常创建任务、完成联合计算、生成结果并符合设计预期。'),
    ('测试环境', '数字资产流通原型系统'),
    ('必选/可选', '必选'),
    ('前置条件', '区块链智能合约已部署、审计系统运行正常，参与方身份及计算接口可用。'),
    ('测试流程', '1.  以卖家身份登录交易系统，在“交易市场”中选择交付方法为“多方安全计算”的交易并确认交易。\n2.  买家在“资产交付”页面查看对应交易，提交计算需求及必要参数，发起交付请求。\n3.  卖家在“资产交付”页面确认任务，按要求上传本方数据或计算材料，提交联合计算。\n4.  系统校验参与方身份、任务参数和数据状态后，创建多方安全计算任务并进入执行状态。\n5.  各参与方仅提交计算所需的受保护数据或中间信息，系统完成协同计算并生成结果摘要和审计记录。\n6.  计算完成且审计通过后，买家在“资产交付”页面获取结果；未通过校验或计算失败时，不开放结果下载。'),
    ('预期结果', '1.  合法参与方能够成功创建并完成多方安全计算任务，结果可按授权方式获取，且与使用明文独立计算得到的结果一致。\n2.  计算过程中不向其他参与方返回未经授权的原始数据；身份、参数或数据校验失败时，任务被拒绝或结果下载受到限制。'),
    ('测试结果', ''),
    ('测试结论', ''),
]
for row, (label, value) in zip(table.findall(W+'tr'), values):
    cells = row.findall(W+'tc')
    set_cell(cells[0], label)
    set_cell(cells[1], value)

# Insert before the section properties, retaining the document's final section settings.
sect = body.find(W+'sectPr')
for elem in (heading, intro, caption, table):
    body.insert(list(body).index(sect), elem)

tree.write(doc_path, encoding='UTF-8', xml_declaration=True)
OUT.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(OUT, 'w', ZIP_DEFLATED) as z:
    for f in TMP.rglob('*'):
        if f.is_file():
            z.write(f, f.relative_to(TMP).as_posix())
print(OUT)
