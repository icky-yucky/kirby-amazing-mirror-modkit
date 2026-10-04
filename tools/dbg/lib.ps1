Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Net.Sockets; using System.Text; using System.Runtime.InteropServices; using System.Threading;
public class G {
  TcpClient c; NetworkStream s;
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, int flags, int extra);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  public static void Front(IntPtr h){ ShowWindow(h,9); keybd_event(0x12,0,0,0); keybd_event(0x12,0,2,0); SetForegroundWindow(h); }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  public static void Tap(byte vk, int ms){ keybd_event(vk,0,0,0); Thread.Sleep(ms); keybd_event(vk,0,2,0); Thread.Sleep(60); }
  public static int[] Rect(IntPtr h){ RECT r; GetWindowRect(h,out r); return new int[]{r.L,r.T,r.R-r.L,r.B-r.T}; }
  public void Connect(int port){ c=new TcpClient("127.0.0.1",port); s=c.GetStream(); s.ReadTimeout=20000; }
  static string Cs(string d){ int x=0; foreach(char ch in d) x+=ch; return (x&255).ToString("x2"); }
  public void Send(string d){ byte[] b=Encoding.ASCII.GetBytes("$"+d+"#"+Cs(d)); s.Write(b,0,b.Length); }
  public void Raw(byte b){ s.WriteByte(b); }
  public string Recv(){ StringBuilder sb=new StringBuilder(); int ch; while(true){ ch=s.ReadByte(); if(ch<0) throw new Exception("closed"); if(ch=='$') break; } while(true){ ch=s.ReadByte(); if(ch=='#') break; sb.Append((char)ch); } s.ReadByte(); s.ReadByte(); s.WriteByte((byte)'+'); return sb.ToString(); }
  public string TryRecv(){ while(s.DataAvailable){ int ch=s.ReadByte(); if(ch=='+') continue; if(ch=='$'){ StringBuilder sb=new StringBuilder(); while(true){ ch=s.ReadByte(); if(ch=='#') break; sb.Append((char)ch);} s.ReadByte(); s.ReadByte(); s.WriteByte((byte)'+'); return sb.ToString(); } } return null; }
  public void Ack(){ Thread.Sleep(150); while(s.DataAvailable){ int b=s.ReadByte(); if(b=='$') break; } }
  public byte[] Mem(uint addr,int len){ byte[] o=new byte[len]; int done=0; while(done<len){ int n=Math.Min(256,len-done); Send("m"+(addr+(uint)done).ToString("x")+","+n.ToString("x")); string r=Recv(); if(r.StartsWith("E")) throw new Exception("mem err at "+(addr+done).ToString("x")); for(int i=0;i<n;i++) o[done+i]=Convert.ToByte(r.Substring(i*2,2),16); done+=n; } return o; }
  public void WriteMem(uint addr, byte[] d){ StringBuilder sb=new StringBuilder(); foreach(byte b in d) sb.Append(b.ToString("x2")); Send("M"+addr.ToString("x")+","+d.Length.ToString("x")+":"+sb.ToString()); Recv(); }
}
'@ -ReferencedAssemblies System.Windows.Forms, System.Drawing
$script:VK = @{ Enter=0x0D; X=0x58; Z=0x5A; Right=0x27; Left=0x25; Up=0x26; Down=0x28; A=0x41; S=0x53; BackSpace=0x08 }
function FromHex($s){ $b = New-Object byte[] ($s.Length/2); for($i=0;$i -lt $b.Length;$i++){ $b[$i]=[Convert]::ToByte($s.Substring($i*2,2),16) }; ,$b }
function Get-Regs($g){ $g.Send("g"); $regs = $g.Recv(); for ($k = 0; $k -lt 17; $k++) { [BitConverter]::ToUInt32((FromHex $regs.Substring($k*8, 8)),0) } }
function Key($h,$vk,$ms=90){ [G]::Front($h); Start-Sleep -Milliseconds 30; if ([G]::GetForegroundWindow() -eq $h) { [G]::Tap([byte]$vk,$ms) } }
function Shot($h,$path){ $rc=[G]::Rect($h); $bmp=New-Object System.Drawing.Bitmap $rc[2],$rc[3]; $gr=[System.Drawing.Graphics]::FromImage($bmp); $gr.CopyFromScreen($rc[0],$rc[1],0,0,$bmp.Size); $bmp.Save($path); $gr.Dispose(); $bmp.Dispose() }
