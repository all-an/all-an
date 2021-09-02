#include <stdio.h>

int main(){
    //double b = 2.0;  //works
    //double score = 3 / b;

    int a = 3; 
    int b = 2;
    double score = a / (double)b; //casting

    printf("%f \n", score);

    double pi = 3.1415;
    int piconverted = (int)pi;
    printf("%f %d \n", pi, piconverted);

}