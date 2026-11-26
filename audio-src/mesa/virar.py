# O som de virar e desvirar uma permanente na mesa no PC (public/audio/mesa/virar.mp3): papel deslizando no feltro,
# subindo até um encosto macio aos 0,17 s (TapFx.SOUND_TOUCH). Sintetizado (ruído filtrado + um baque grave), sem
# arquivo de origem. Para refazer:
#   python audio-src/mesa/virar.py audio-src/mesa && ffmpeg -y -i audio-src/mesa/virar.wav -codec:a libmp3lame -b:a 128k public/audio/mesa/virar.mp3
import numpy as np, wave, sys, os
SR=44100
rng=np.random.default_rng(7)
out=sys.argv[1]
def biquad(x,kind,f,q=0.7):
    # f pode ser array (varredura)
    f=np.broadcast_to(np.asarray(f,float),x.shape)
    y=np.zeros_like(x); x1=x2=y1=y2=0.0
    for i in range(len(x)):
        w=2*np.pi*f[i]/SR; a=np.sin(w)/(2*q); c=np.cos(w)
        if kind=='bp': b0,b1,b2=a,0,-a
        elif kind=='lp': b0=(1-c)/2;b1=1-c;b2=b0
        else: b0=(1+c)/2;b1=-(1+c);b2=b0
        a0=1+a;a1=-2*c;a2=1-a
        yi=(b0*x[i]+b1*x1+b2*x2-a1*y1-a2*y2)/a0
        x2,x1=x1,x[i]; y2,y1=y1,yi; y[i]=yi
    return y
def env(n,att,dec):
    t=np.arange(n)/SR; e=np.where(t<att,(t/att)**2,np.exp(-(t-att)/dec)); return e
def thump(dur,f0,f1,dec):
    t=np.arange(int(dur*SR))/SR; f=f0+(f1-f0)*t/dur
    return np.sin(2*np.pi*np.cumsum(f)/SR)*np.exp(-t/dec)
def save(name,x,peak=0.32):
    x=x/np.max(np.abs(x))*peak
    fade=int(0.01*SR); x[-fade:]*=np.linspace(1,0,fade)
    d=(x*32767).astype(np.int16)
    with wave.open(os.path.join(out,name+'.wav'),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(SR);w.writeframes(d.tobytes())
n=int(0.34*SR); noise=rng.standard_normal(n)
sweep=np.linspace(1400,3200,n)
a=biquad(noise,'bp',sweep,1.1)*env(n,0.16,0.07)
th=np.zeros(n); t0=int(0.17*SR); tp=thump(0.12,150,90,0.03); th[t0:t0+len(tp)]+=tp[:n-t0]*0.5
save('virar',a+th)
