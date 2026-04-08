use crate::runtime::HostEvent;

pub trait NativeHost {
    fn emit(&mut self, event: HostEvent);
}

#[derive(Default)]
pub struct ConsoleHost {
    verbose: bool,
}

impl ConsoleHost {
    pub fn new(verbose: bool) -> Self {
        Self { verbose }
    }
}

impl NativeHost for ConsoleHost {
    fn emit(&mut self, event: HostEvent) {
        match event {
            HostEvent::Log { stream, text } => match stream.as_str() {
                "stdout" => print!("{text}"),
                "stderr" => eprint!("{text}"),
                _ if self.verbose => println!("[{stream}] {text}"),
                _ => {}
            },
            HostEvent::Plot { index, title, mime } => {
                if self.verbose {
                    println!("[plot] index={index} title={title} mime={mime}");
                }
            }
            HostEvent::SeqFile { filename } => {
                if self.verbose {
                    println!("[seq] {filename}");
                }
            }
        }
    }
}
