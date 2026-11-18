from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess, json
ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'raw'
EDIT = ROOT / 'edit'
EDIT.mkdir(exist_ok=True)
regular='/System/Library/Fonts/Supplemental/Arial.ttf'
bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
def font(size, weight=False): return ImageFont.truetype(bold if weight else regular,size)
def centered(draw,text,y,size,color='#1e2927',weight=False):
    f=font(size,weight); box=draw.textbbox((0,0),text,font=f)
    draw.text(((1920-(box[2]-box[0]))/2,y),text,font=f,fill=color)
def run(args):
    p=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y']+args,capture_output=True,text=True)
    if p.returncode: raise RuntimeError(p.stderr)
def card(name,lines):
    im=Image.new('RGB',(1920,1080),'#edf4f1');d=ImageDraw.Draw(im)
    for text,y,size,weight in lines: centered(d,text,y,size,weight=weight)
    im.save(EDIT/(name+'.png'))
    run(['-loop','1','-i',str(EDIT/(name+'.png')),'-t','6','-vf','fps=30,format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=5.65:d=0.35','-c:v','libx264','-crf','18',str(EDIT/(name+'.mp4'))])
card('intro',[('Kudium Browser',290,38,False),('The web. Your code.',390,88,True),('One workspace.',500,88,True),('An open-source browser for building on the web.',675,34,False)])
card('outro',[('Kudium Browser',310,76,True),('Your web, code, and tools — together.',435,48,False),('Free and open source.',575,34,False),('browser.kudium.com',690,42,True)])
scenes=[
 ('workspace','Your project, beside the web.','Link a local folder to a browser group.'),
 ('files','Find the file. Keep your place.','Browse project files alongside your reference tabs.'),
 ('editor','Make a change. Save it locally.','A real edit in the built-in project editor.'),
 ('terminal','Run your checks right here.','A real Atlas Studio test run in the project terminal.'),
 ('assistant','Bring your brief into the conversation.','Project context attached to an unsent AI draft.'),
 ('hooks','Make the web work your way.','Website hooks · illustrative entries in the Atlas Studio demo.'),
]
files=[EDIT/'intro.mp4']
for name,title,subtitle in scenes:
    overlay=Image.new('RGBA',(1920,1080),(244,248,246,255));d=ImageDraw.Draw(overlay)
    centered(d,title,23,38,weight=True);centered(d,subtitle,74,24,color='#566963')
    # Leave the footage rectangle transparent; preserve full production UI.
    d.rectangle((240,140,1679,1079),fill=(0,0,0,0))
    overlay.save(EDIT/(name+'.png'))
    output=EDIT/(name+'.mp4')
    zoom = "zoompan=z='if(lte(on,90),1,min(2.2,1+(on-90)/100))':x='iw-iw/zoom':y='ih-ih/zoom':d=1:s=1440x940:fps=30," if name in ['terminal','assistant'] else ''
    if name == 'files': zoom = "zoompan=z='if(lte(on,90),1,min(1.65,1+(on-90)/150))':x='iw-iw/zoom':y=0:d=1:s=1440x940:fps=30,"
    run(['-i',str(RAW/(name+'.mp4')),'-i',str(EDIT/(name+'.png')),'-filter_complex','[0:v]fps=30,'+zoom+'pad=1920:1080:240:140:color=0xf4f8f6[base];[base][1:v]overlay=0:0,scale=1920:1080,setsar=1,format=yuv420p,fade=t=in:st=0:d=0.2,fade=t=out:st=7.8:d=0.2[v]','-map','[v]','-an','-c:v','libx264','-crf','18',str(output)])
    files.append(output)
files.append(EDIT/'outro.mp4')
(EDIT/'concat.txt').write_text(''.join("file '"+str(p)+"'\n" for p in files))
run(['-f','concat','-safe','0','-i',str(EDIT/'concat.txt'),'-c','copy','-movflags','+faststart',str(ROOT/'Kudium-Launch-Demo.mp4')])
run(['-ss','3','-i',str(ROOT/'Kudium-Launch-Demo.mp4'),'-frames:v','1',str(ROOT/'poster.png')])
# Subtitles are also provided for accessible distribution.
( ROOT/'captions.srt').write_text('''1
00:00:00,000 --> 00:00:06,000
Kudium Browser. The web. Your code. One workspace.

'''+''.join(f'{i+2}\n00:00:{6+i*8:02d},000 --> 00:00:{14+i*8:02d},000\n{title}\n{subtitle}\n\n' for i,(_,title,subtitle) in enumerate(scenes))+'''8
00:00:54,000 --> 00:01:00,000
Kudium Browser. Your web, code, and tools — together.
Free and open source. browser.kudium.com
''')
print(ROOT/'Kudium-Launch-Demo.mp4')
