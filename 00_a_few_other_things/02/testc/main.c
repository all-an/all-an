#include <stdio.h>
#include <unistd.h>

int main() {
    for(int i = 0;i < 10;i++)
    {
        printf(".");
        fflush(stdout);
        sleep(1);
    }
}
