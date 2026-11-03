#define main passive_regression_main
#include "test_firmware_lifecycle.c"
#undef main
int main(void){
 assert(stats.sampling==RX_SAMPLE_TRIPLE);
 reset_test();twai_timing_config_t t;
 assert(timing_for(250000,RX_SAMPLE_TRIPLE,&t));
 assert(t.quanta_resolution_hz==4000000&&t.tseg_1==11&&t.tseg_2==4&&t.triple_sampling);
 for(unsigned i=0;i<RX_SAMPLE_COUNT;i++){
  rx_sampling_t parsed=RX_SAMPLE_COUNT;
  assert(reader_sampling_parse(reader_sampling_name(i),&parsed)==(i==RX_SAMPLE_TRIPLE));
  if(i!=RX_SAMPLE_TRIPLE)assert(!timing_for(250000,i,&t));
 }
 assert(!timing_for(500000,RX_SAMPLE_TRIPLE,&t));assert(!timing_for(125000,RX_SAMPLE_TRIPLE,&t));
 installed=false;fake_driver_installed=false;stats.running=false;
 command_outcome_t out={0};char wrong[]="SAMPLE DEFAULT";handle_command(wrong,&out);assert(out.error[0]&&stats.sampling==RX_SAMPLE_TRIPLE);
 memset(&out,0,sizeof(out));char rate[]="START 500000";handle_command(rate,&out);assert(out.error[0]&&!installed);
 assert(!strcmp(READER_SAMPLING_PROFILES_JSON,"[\"TRIPLE\"]"));
 puts("PASS firmware054: bootTRIPLE, only250k/75percent/triple, all alternative profiles/rates rejected before CANstart");return 0;
}
