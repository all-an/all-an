#include <stdio.h>
#include <stdlib.h>

int main(){
    char map[5][10];

    /*
    map[0][0] = '|';
    map[4][9] = '@';
    */
    //printf("%c %c \n", map[0][0], map[4][9] );

    FILE* f; //variable type pointer to FILE*
    f = fopen("map.txt", "r"); //function fopen, r for read
    if(f == 0){
        printf("Error opening map\n"); //if there's no file
        exit(1);
    }
}